/** The app icon (the "hoisted trophy"), same artwork as the home-screen icon and browser tab. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      className="shrink-0 shadow-sm"
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
      draggable={false}
    />
  );
}
