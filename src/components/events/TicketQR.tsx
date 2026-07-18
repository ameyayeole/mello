import { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { create as createQr } from 'qrcode';

// Renders a QR entirely in JS (qrcode builds the module matrix, react-native-svg
// paints it) — no camera/barcode native module needed on the showing side.
export default function TicketQR({
  value,
  size,
  color = '#0F182C',
}: {
  value: string;
  size: number;
  color?: string;
}) {
  const { path, moduleCount } = useMemo(() => {
    // M error correction: enough redundancy for a phone-to-phone scan without
    // bloating the module count for our ~80-char payload.
    const qr = createQr(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const parts: string[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.get(r, c)) parts.push(`M${c} ${r}h1v1h-1z`);
      }
    }
    return { path: parts.join(''), moduleCount: n };
  }, [value]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${moduleCount} ${moduleCount}`}>
      <Path d={path} fill={color} />
    </Svg>
  );
}
