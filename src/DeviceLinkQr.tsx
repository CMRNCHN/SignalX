import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders a high-contrast QR for a Signal device-link URI. */
export function DeviceLinkQr({ uri }: { uri: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setDataUrl(null);
    void QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "QR failed");
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (error) {
    return (
      <div className="device-link-qr" title={error}>
        <span className="hint tight">QR unavailable — use Copy</span>
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div className="device-link-qr">
        <span className="hint tight">…</span>
      </div>
    );
  }

  return (
    <div className="device-link-qr">
      <img src={dataUrl} alt="Scan with Signal to link this device" />
    </div>
  );
}
