import { recordImpressions } from '../impressions.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('recordImpressions', () => {
  it('sends the ids to the record_impressions RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
    await recordImpressions(['p1', 'p2']);
    expect(supabase.rpc).toHaveBeenCalledWith('record_impressions', {
      p_post_ids: ['p1', 'p2'],
    });
  });

  it('does not call the RPC for an empty batch', async () => {
    await recordImpressions([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  // Impression recording is fire-and-forget telemetry. A failure here must
  // never surface as a feed error or an unhandled rejection.
  it('swallows an RPC error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(recordImpressions(['p1'])).resolves.toBeUndefined();
  });

  it('swallows a thrown network error', async () => {
    (supabase.rpc as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(recordImpressions(['p1'])).resolves.toBeUndefined();
  });
});
