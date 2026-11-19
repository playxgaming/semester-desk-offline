package app.semesterdesk;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.print.PrintManager;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.UUID;

/** Private staging, bounded chunks, and the system Storage Access Framework. */
@CapacitorPlugin(name = "DeskExport")
public class DeskExportPlugin extends Plugin {
    private File staged;
    private String token;
    private String title;
    private String mime;
    private long expected;
    private long written;
    private boolean choosing;

    @Override
    public void load() {
        File[] files = getContext().getCacheDir().listFiles();
        if (files != null) for (File file : files) {
            if (file.getName().startsWith("semester-desk-export-") && file.lastModified() < System.currentTimeMillis() - 86400000L) file.delete();
        }
    }

    private synchronized void clear() {
        if (staged != null) staged.delete();
        staged = null; token = null; choosing = false; written = 0;
    }

    private boolean matches(PluginCall call) {
        return staged != null && token != null && token.equals(call.getString("token"));
    }

    @PluginMethod
    public synchronized void begin(PluginCall call) {
        if (choosing) { call.reject("Finish the current save-file picker first."); return; }
        // A WebView reload can abandon preparation before the picker opens.
        // Only private staging is replaced; the student's records are untouched.
        if (staged != null) clear();
        Long size = call.getLong("size");
        if (size == null || size < 0 || size > 128L * 1024 * 1024) { call.reject("Invalid export size (maximum 128 MB)."); return; }
        if (size + 2097152L > getContext().getCacheDir().getUsableSpace()) { call.reject("Not enough device space to prepare this export."); return; }
        title = call.getString("name", "semester-desk-export").replaceAll("[\\\\/\\p{Cntrl}]", "_");
        if (title.length() > 200) title = title.substring(0, 200);
        mime = call.getString("type", "application/octet-stream");
        if (!mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")) mime = "application/octet-stream";
        try {
            staged = File.createTempFile("semester-desk-export-", ".tmp", getContext().getCacheDir());
            token = UUID.randomUUID().toString(); expected = size; written = 0;
            JSObject result = new JSObject(); result.put("token", token); call.resolve(result);
        } catch (Exception error) { clear(); call.reject("Could not prepare the export. Free device space and retry."); }
    }

    @PluginMethod
    public synchronized void append(PluginCall call) {
        if (!matches(call) || choosing) { call.reject("This export is no longer writable."); return; }
        String data = call.getString("data");
        if (data == null || data.length() > 262144 || !data.matches("[A-Za-z0-9+/]*={0,2}")) { clear(); call.reject("Invalid export chunk."); return; }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (written + bytes.length > expected) throw new IllegalArgumentException();
            try (FileOutputStream out = new FileOutputStream(staged, true)) { out.write(bytes); }
            written += bytes.length; call.resolve();
        } catch (Exception error) { clear(); call.reject("The export could not be prepared completely. Retry after freeing space."); }
    }

    @PluginMethod
    public synchronized void finish(PluginCall call) {
        if (!matches(call) || choosing || written != expected) { call.reject("The export is incomplete. Retry it."); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(mime); intent.putExtra(Intent.EXTRA_TITLE, title);
        choosing = true;
        try { startActivityForResult(call, intent, "saved"); }
        catch (Exception error) { clear(); call.reject("No Android file picker is available. Your app data has not changed."); }
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) { clear(); return; }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            clear(); JSObject value = new JSObject(); value.put("saved", false); call.resolve(value); return;
        }
        getBridge().execute(() -> {
            synchronized (this) {
                try {
                    if (staged == null || staged.length() != expected) throw new IllegalStateException();
                    try (FileInputStream in = new FileInputStream(staged); OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w")) {
                        if (out == null) throw new IllegalStateException();
                        byte[] buffer = new byte[65536]; int count;
                        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                        out.flush();
                    }
                    clear(); JSObject value = new JSObject(); value.put("saved", true); call.resolve(value);
                } catch (Exception error) { clear(); call.reject("The destination could not save a complete copy. Keep your app data and retry the export."); }
            }
        });
    }

    @PluginMethod
    public synchronized void cancel(PluginCall call) {
        if (matches(call) && !choosing) clear();
        call.resolve();
    }

    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                if (manager == null) throw new IllegalStateException();
                manager.print("Semester Desk", getBridge().getWebView().createPrintDocumentAdapter("Semester Desk"), null);
                call.resolve();
            } catch (Exception error) { call.reject("Android printing is unavailable. Export a DOCX copy instead."); }
        });
    }

    @Override
    protected void handleOnDestroy() { clear(); }
}
