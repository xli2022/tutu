/* ── Spendscape · Vault ─────────────────────────────────────────────────
   Locks what Spendscape keeps in the browser with the user's password,
   using only the browser's own Web Crypto:

     key   PBKDF2 with SHA-256, a random 16-byte salt per vault and
           600,000 iterations, giving a non-extractable AES-256-GCM key;
     seal  the text is gzipped when the browser can (encrypted data can't
           be compressed afterwards), then encrypted with AES-GCM under a
           fresh random 12-byte IV, bound to this app by its additional
           data. A wrong password or any tampering fails the GCM check.

   The password is never stored and the key never leaves memory. Sealed
   form: { kdf, iter, salt, iv, z, data } with byte strings in base64.   */
(function (kit) {
  "use strict";

  var ITERATIONS = 600000;
  var AAD = "tutu.spendscape vault v1";

  function subtle() {
    var c = typeof crypto !== "undefined" ? crypto : null;
    return c && c.subtle ? c.subtle : null;
  }

  function supported() {
    return !!subtle() && typeof TextEncoder !== "undefined";
  }

  function utf8(s) { return new TextEncoder().encode(s); }

  function b64(bytes) {
    var s = "", CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(s);
  }

  function unb64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function random(n) {
    var a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
  }

  // gzip / gunzip through the browser's streams, when it has them.
  function pipe(bytes, stream) {
    var piped = new Blob([bytes]).stream().pipeThrough(stream);
    return new Response(piped).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }
  var canZip = typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined" &&
    typeof Blob !== "undefined" && typeof Response !== "undefined";

  /* A key for this password and salt. Slow on purpose: that is what
     makes guessing passwords expensive. */
  function deriveKey(password, salt, iterations) {
    var s = subtle();
    return s.importKey("raw", utf8(password), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return s.deriveKey({ name: "PBKDF2", salt: salt, iterations: iterations || ITERATIONS, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }

  /* A new vault for a password: { key, salt, iter }. */
  function create(password) {
    var salt = random(16);
    return deriveKey(password, salt, ITERATIONS).then(function (key) {
      return { key: key, salt: salt, iter: ITERATIONS };
    });
  }

  /* Text in, sealed object out. */
  function seal(vault, text) {
    var iv = random(12), plain = utf8(text);
    return (canZip ? pipe(plain, new CompressionStream("gzip")) : Promise.resolve(plain)).then(function (bytes) {
      return subtle().encrypt({ name: "AES-GCM", iv: iv, additionalData: utf8(AAD) }, vault.key, bytes);
    }).then(function (ct) {
      return { kdf: "PBKDF2-SHA256", iter: vault.iter, salt: b64(vault.salt), iv: b64(iv), z: canZip ? "gzip" : "", data: b64(new Uint8Array(ct)) };
    });
  }

  /* Sealed object and an open vault's key in, text out. Rejects if the
     key is not the one it was sealed with, or the data was changed. */
  function open(vault, sealed) {
    return subtle().decrypt({ name: "AES-GCM", iv: unb64(sealed.iv), additionalData: utf8(AAD) }, vault.key, unb64(sealed.data))
      .then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (sealed.z === "gzip") {
          if (!canZip) throw new Error("This browser can't unpack these statements.");
          return pipe(bytes, new DecompressionStream("gzip"));
        }
        return bytes;
      })
      .then(function (bytes) { return new TextDecoder().decode(bytes); });
  }

  /* Password and sealed object in: { vault, text }, or a rejection
     (named "WrongPassword" when the password doesn't open it). */
  function unlock(password, sealed) {
    var salt = unb64(sealed.salt);
    return deriveKey(password, salt, sealed.iter || ITERATIONS).then(function (key) {
      var vault = { key: key, salt: salt, iter: sealed.iter || ITERATIONS };
      return open(vault, sealed).then(function (text) {
        return { vault: vault, text: text };
      }, function (err) {
        var e = new Error("That password doesn't open these statements.");
        e.name = "WrongPassword";
        e.cause = err;
        throw e;
      });
    });
  }

  // Whether an open vault's key is the one a sealed object was made with.
  function sameSalt(vault, sealed) {
    return !!vault && !!sealed && b64(vault.salt) === sealed.salt;
  }

  kit.vault = { supported: supported, create: create, seal: seal, open: open, unlock: unlock, sameSalt: sameSalt, ITERATIONS: ITERATIONS };
})(window.SpendscapeKit = window.SpendscapeKit || {});
