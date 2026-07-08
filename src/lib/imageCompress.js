export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
// Redimensionne/compresse la photo pour ne pas saturer le stockage.
export function compressImage(dataURL, maxDim = 1000, quality = 0.68) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    // Échec de décodage (ex: format HEIC non supporté) : on ne renvoie surtout
    // pas l'image d'origine telle quelle, elle peut peser plusieurs Mo.
    img.onerror = () => resolve(null);
    img.src = dataURL;
  });
}
