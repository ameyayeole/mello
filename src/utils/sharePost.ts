import { Share } from 'react-native';
import * as Linking from 'expo-linking';

// Share a post via the native sheet (external apps + the OS "Copy" action). The
// message carries a mello://post/<id> deep link; +native-intent resolves it to
// the post detail screen. Send-to-a-Mello-DM is a later add (needs a friend
// picker + chat insert) — the native sheet covers external + copy today.
export async function sharePost(post: {
  id: string;
  body: string | null;
  author_name: string;
}): Promise<void> {
  const url = Linking.createURL(`post/${post.id}`);
  const preview = post.body
    ? `"${post.body.slice(0, 100)}"`
    : `${post.author_name} on Mello`;
  const message = `${preview}\n\n👉 ${url}`;
  try {
    await Share.share({ message });
  } catch {
    // User dismissed the share sheet — nothing to do.
  }
}
