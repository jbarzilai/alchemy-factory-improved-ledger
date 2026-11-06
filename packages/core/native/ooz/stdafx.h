// Portable replacement for ooz's MSVC-only stdafx.h (GCC on Linux, mingw-w64 for Windows).
// MSVC intrinsics are mapped to kdec_* functions with #defines placed AFTER every system header,
// so mingw's own declarations of _rotl/_byteswap_* (in <stdlib.h>) never clash with ours.
#pragma once

#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <x86intrin.h>

typedef uint8_t byte;
typedef uint8_t uint8;
typedef uint32_t uint32;
typedef uint64_t uint64;
typedef int64_t int64;
typedef int32_t int32;
typedef uint16_t uint16;
typedef int16_t int16;
typedef unsigned int uint;

#ifndef __forceinline
#define __forceinline inline __attribute__((always_inline))
#endif

// Index pointer type varies at call sites (unsigned long*, uint32*, int*); the mask is always 32-bit.
template <typename T> static inline unsigned char kdec_BitScanReverse(T *index, uint32_t mask) {
  if (mask == 0) return 0;
  *index = (T)(31 - __builtin_clz(mask));
  return 1;
}
template <typename T> static inline unsigned char kdec_BitScanForward(T *index, uint32_t mask) {
  if (mask == 0) return 0;
  *index = (T)__builtin_ctz(mask);
  return 1;
}
static inline uint32_t kdec_rotl(uint32_t x, int n) {
  n &= 31;
  return n ? (x << n) | (x >> (32 - n)) : x;
}
static inline uint16_t kdec_bswap16(uint16_t x) { return __builtin_bswap16(x); }
static inline uint32_t kdec_bswap32(uint32_t x) { return __builtin_bswap32(x); }
static inline uint64_t kdec_bswap64(uint64_t x) { return __builtin_bswap64(x); }

#define _BitScanReverse kdec_BitScanReverse
#define _BitScanForward kdec_BitScanForward
#define _rotl kdec_rotl
#define _byteswap_ushort kdec_bswap16
#define _byteswap_ulong kdec_bswap32
#define _byteswap_uint64 kdec_bswap64
