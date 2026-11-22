export function telecharger(nomFichier: string, contenu: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
