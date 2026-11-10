export async function headers() {
  return new Headers({ "user-agent": typeof navigator !== "undefined" ? navigator.userAgent : "preview" });
}
export async function cookies() {
  const jar = new Map();
  if (typeof document !== "undefined") {
    document.cookie.split(";").forEach((entry) => {
      const [name, ...rest] = entry.trim().split("=");
      if (name) jar.set(name, { name, value: rest.join("=") });
    });
  }
  return jar;
}
export async function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} };
}
