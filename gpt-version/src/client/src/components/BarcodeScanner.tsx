import { useCallback, useEffect, useRef, useState } from "react";

type ScannerStatus = "starting" | "active" | "blocked" | "unsupported" | "error" | "paused";

type BarcodeScannerProps = Readonly<{
  active: boolean;
  onDetected(barcode: string): void;
}>;

export function BarcodeScanner({ active, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);
  const callbackRef = useRef(onDetected);
  const lastDetectionRef = useRef({ value: "", at: 0 });
  const generationRef = useRef(0);
  const [status, setStatus] = useState<ScannerStatus>(active ? "starting" : "paused");
  const [restartToken, setRestartToken] = useState(0);

  callbackRef.current = onDetected;

  const stop = useCallback(() => {
    generationRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!active) {
      stop();
      setStatus("paused");
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let disposed = false;
    setStatus("starting");

    void import("@zxing/browser").then(async ({ BrowserMultiFormatReader }) => {
      if (disposed || generationRef.current !== generation || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      try {
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result) => {
            if (!result || disposed || generationRef.current !== generation) return;
            const value = result.getText().trim();
            if (!value) return;
            const now = Date.now();
            const last = lastDetectionRef.current;
            if (last.value === value && now - last.at < 2_500) return;
            lastDetectionRef.current = { value, at: now };
            callbackRef.current(value);
          }
        );
        if (disposed || generationRef.current !== generation) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus("active");
      } catch (error) {
        if (disposed || generationRef.current !== generation) return;
        const name = error instanceof DOMException ? error.name : "";
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "error");
      }
    }).catch(() => {
      if (!disposed && generationRef.current === generation) setStatus("error");
    });

    return () => {
      disposed = true;
      stop();
    };
  }, [active, restartToken, stop]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else if (active) setRestartToken((value) => value + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, stop]);

  useEffect(() => {
    const onExternalScan = (event: Event) => {
      const barcode = event instanceof CustomEvent ? String(event.detail || "").trim() : "";
      if (active && barcode) callbackRef.current(barcode);
    };
    window.addEventListener("dvorik:barcode-scan", onExternalScan);
    return () => window.removeEventListener("dvorik:barcode-scan", onExternalScan);
  }, [active]);

  const retry = () => setRestartToken((value) => value + 1);

  return (
    <div className={`barcode-camera barcode-camera-${status}`} data-testid="barcode-scanner">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Камера сканера штрихкодов" />
      <div className="barcode-camera-frame" aria-hidden="true" />
      <div className="barcode-camera-status" role="status">
        {status === "starting" && "Запускаем камеру…"}
        {status === "active" && "Наведите штрихкод внутрь рамки"}
        {status === "paused" && "Сканирование приостановлено"}
        {status === "unsupported" && "Камера недоступна. Используйте ручной поиск."}
        {status === "blocked" && "Разрешите Telegram доступ к камере."}
        {status === "error" && "Не удалось запустить камеру."}
      </div>
      {(status === "blocked" || status === "error") && (
        <button type="button" className="secondary small barcode-camera-retry" onClick={retry}>
          Включить камеру
        </button>
      )}
    </div>
  );
}
