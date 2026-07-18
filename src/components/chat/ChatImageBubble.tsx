import { useState } from 'react';
import { View, StyleSheet, Modal, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Icon, PressableScale } from '@/components/ui';

// An image message: rounded thumbnail sized for the bubble column, tap for a
// full-screen viewer. `uri` may be a local file (optimistic) or a public URL.

export default function ChatImageBubble({
  uri,
  dimmed,
}: {
  uri: string;
  dimmed?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <PressableScale scaleTo={0.97} onPress={() => setOpen(true)}>
        <Image
          source={{ uri }}
          style={[styles.thumb, dimmed && { opacity: 0.6 }]}
          contentFit="cover"
          transition={150}
        />
      </PressableScale>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.viewer}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
          />
          <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
            <Icon name="close" size={18} color="#fff" strokeWidth={2} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: 210,
    height: 210,
    borderRadius: 16,
    backgroundColor: 'rgba(15,24,44,0.08)',
  },
  viewer: { flex: 1, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute',
    top: 58,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
