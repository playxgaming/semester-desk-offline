export interface ImageAdjustment { rotate: number; left: number; top: number; width: number; height: number }
export async function adjustImage(file: File, adjustment: ImageAdjustment): Promise<File> {
  const image = await createImageBitmap(file)
  try {
    if (image.width * image.height > 32_000_000) throw new Error('This photo is too large to process safely. Resize it below 32 megapixels.')
    const rotated = document.createElement('canvas'), swap = adjustment.rotate % 180 !== 0
    const scale = Math.min(1, 2200 / Math.max(image.width, image.height))
    const width = Math.round(image.width * scale), height = Math.round(image.height * scale)
    rotated.width = swap ? height : width; rotated.height = swap ? width : height
    const ctx = rotated.getContext('2d')!
    ctx.translate(rotated.width / 2, rotated.height / 2); ctx.rotate(adjustment.rotate * Math.PI / 180); ctx.drawImage(image, -width / 2, -height / 2, width, height)
    const x = Math.floor(rotated.width * adjustment.left / 100), y = Math.floor(rotated.height * adjustment.top / 100)
    const w = Math.min(rotated.width - x, Math.floor(rotated.width * adjustment.width / 100)), h = Math.min(rotated.height - y, Math.floor(rotated.height * adjustment.height / 100))
    if (w < 10 || h < 10) throw new Error('Choose a crop at least 10 pixels wide and high.')
    const cropped = document.createElement('canvas'); cropped.width = w; cropped.height = h
    cropped.getContext('2d')!.drawImage(rotated, x, y, w, h, 0, 0, w, h)
    const blob = await new Promise<Blob>((resolve, reject) => cropped.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare this image.')), 'image/png'))
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-adjusted.png', { type: 'image/png' })
  } finally { image.close() }
}
