export default function Logo({ size = 22 }) {
  return (
    <img
      src="/logo.png"
      alt="Gramofon"
      width={size}
      height={size}
      style={{ display: "block", borderRadius: "50%" }}
    />
  );
}
