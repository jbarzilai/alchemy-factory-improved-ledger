// kdec: decode one Oodle Kraken block and write the raw bytes to stdout. Never writes files.
// Usage: kdec <in.sav|-> <offset> <compressedSize> <uncompressedSize>   ("-" = read from stdin)
// System headers come before stdafx.h, whose #defines rename MSVC intrinsics.
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
#include "ooz/stdafx.h"

int Kraken_Decompress(const byte *src, size_t src_len, byte *dst, size_t dst_len);

static const size_t SAFE_SPACE = 64; // the decoder may write slightly past the end of dst

static int fail(const char *msg) {
  fprintf(stderr, "kdec: %s\n", msg);
  return 1;
}

static bool parse_size(const char *s, unsigned long long *out) {
  if (!isdigit((unsigned char)*s)) return false; // strtoull would accept ' -1' and '+1'
  char *end;
  errno = 0;
  unsigned long long v = strtoull(s, &end, 10);
  if (errno != 0 || *s == '\0' || *s == '-' || *end != '\0') return false;
  *out = v;
  return true;
}

static bool read_exact(FILE *f, byte *buf, size_t n) {
  size_t got = 0;
  while (got < n) {
    size_t k = fread(buf + got, 1, n - got, f);
    if (k == 0) return false;
    got += k;
  }
  return true;
}

static bool skip(FILE *f, unsigned long long n) {
  byte chunk[65536];
  while (n > 0) {
    size_t want = n < sizeof chunk ? (size_t)n : sizeof chunk;
    if (!read_exact(f, chunk, want)) return false;
    n -= want;
  }
  return true;
}

int main(int argc, char **argv) {
  if (argc != 5) return fail("usage: kdec <in.sav|-> <offset> <compressedSize> <uncompressedSize>");
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif
  unsigned long long offset, csize, usize;
  if (!parse_size(argv[2], &offset) || !parse_size(argv[3], &csize) || !parse_size(argv[4], &usize)) {
    return fail("offset and sizes must be non-negative decimal integers");
  }
  if (csize == 0 || usize == 0 || usize >= (1ull << 31)) return fail("sizes out of range");

  bool from_stdin = strcmp(argv[1], "-") == 0;
  FILE *in = from_stdin ? stdin : fopen(argv[1], "rb");
  if (!in) return fail("cannot open input for reading");
  byte *src = (byte *)malloc(csize);
  byte *dst = (byte *)malloc(usize + SAFE_SPACE);
  if (!src || !dst) return fail("out of memory");
  if (!skip(in, offset) || !read_exact(in, src, csize)) return fail("input is shorter than offset + compressedSize");
  if (!from_stdin) fclose(in);

  int n = Kraken_Decompress(src, csize, dst, usize);
  if (n < 0 || (unsigned long long)n != usize) return fail("decompression failed");
  if (fwrite(dst, 1, usize, stdout) != usize || fflush(stdout) != 0) return fail("write to stdout failed");
  return 0;
}
