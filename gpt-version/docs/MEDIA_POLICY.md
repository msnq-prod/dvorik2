# Media processing policy

Дата: 2026-07-12.

- Processor: direct production dependency `sharp`; production startup performs a real JPEG encode capability check before `listen`.
- Orientation: EXIF orientation is applied with auto-rotate before resize.
- Geometry: image fits inside `1920×1920` without enlargement.
- Encoding: JPEG/WebP quality 82; PNG compression level 9 with palette optimization.
- Metadata: output strips EXIF/profile metadata by default; orientation is normalized into pixels.
- Safety: processor errors reject upload before storage; production never saves original as a compression fallback. Input pixel ceiling is 40,000,000.
- Deferred to `MED-1101/1102`: streaming decode, magic-byte validation, decompression-bomb isolation, explicit color-profile policy and variants.
