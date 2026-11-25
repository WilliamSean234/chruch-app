import { test } from "node:test";
import assert from "node:assert/strict";
import { isPushEndpoint } from "../src/lib/pushRules";

test("layanan push resmi browser diterima", () => {
  for (const u of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/xyz",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QGx",
  ]) assert.equal(isPushEndpoint(u), true, u);
});

test("alamat lain ditolak: internal, metadata cloud, http, port aneh, menyamar", () => {
  for (const u of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://169.254.169.254/latest/meta-data/",
    "https://localhost/x",
    "https://10.0.0.5/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilnotify.windows.com/x",
    "https://evil.example/push.services.mozilla.com",
    "ftp://fcm.googleapis.com/x",
    "bukan url",
  ]) assert.equal(isPushEndpoint(u), false, u);
});
