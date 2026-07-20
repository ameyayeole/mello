import { useRef } from 'react';
import { SPACING } from '@/constants/spacing';
import { View, Text, StyleSheet, Modal } from 'react-native';
// expo-camera is imported here (not in the host screen) so this whole module is
// only ever evaluated after isLiveScannerAvailable() confirms the ExpoCamera
// native module exists. On older binaries the host screen never imports this.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, IconButton } from '@/components/ui';

// Full-screen live QR scanner. Calls onScan with each decoded string; the parent
// decides whether it was a valid ticket. While `paused` (parent showing a result
// banner) scanning is ignored.
export default function LiveScanner({
  onScan,
  onClose,
  paused = false,
}: {
  onScan: (raw: string) => void;
  onClose: () => void;
  paused?: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  // The camera fires continuously; ignore repeats within 1.5s.
  const lastScan = useRef(0);

  const handleScan = ({ data }: { data: string }) => {
    const now = Date.now();
    if (paused || now - lastScan.current < 1500) return;
    lastScan.current = now;
    onScan(data);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.center} />
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.permTitle}>Camera access needed</Text>
            <Text style={styles.permBody}>
              Allow camera access to scan attendees' QR codes at the door.
            </Text>
            <Button label="Allow camera" onPress={requestPermission} />
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScan}
            />
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.reticle} />
              <Text style={styles.hint}>
                Point at a guest's Mello ticket QR
              </Text>
            </View>
          </>
        )}

        <View style={styles.topBar}>
          <IconButton
            icon="close"
            variant="surface"
            onPress={onClose}
            accessibilityLabel="Close scanner"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[3],
    padding: SPACING[8],
    backgroundColor: COLORS.background,
  },
  permTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    color: COLORS.textPrimary,
  },
  permBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[5],
  },
  reticle: {
    width: 240,
    height: 240,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  hint: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  topBar: { position: 'absolute', top: 52, left: 16 },
});
