package app.semesterdesk;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeskExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
