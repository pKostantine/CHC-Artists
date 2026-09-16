import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function importLrcFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  if (Platform.OS === 'web' && asset.file) return asset.file.text();
  return FileSystem.readAsStringAsync(asset.uri);
}

export async function exportLrcFile(filename: string, contents: string): Promise<void> {
  const safeName = filename.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'lyrics';

  if (Platform.OS === 'web') {
    const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeName}.lrc`;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const path = `${FileSystem.cacheDirectory}${safeName}.lrc`;
  await FileSystem.writeAsStringAsync(path, contents);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(path, {
    mimeType: 'text/plain',
    dialogTitle: 'Export synchronized lyrics',
  });
}
