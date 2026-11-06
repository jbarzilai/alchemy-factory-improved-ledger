// Stubs for ooz codecs these saves never use (LZNA, Bitknit). They report failure, so a block
// that asks for them makes Kraken_Decompress fail cleanly instead of linking in more code.
#include "ooz/stdafx.h"

struct LznaState;
struct BitknitState;

int LZNA_DecodeQuantum(byte *, byte *, byte *, const byte *, const byte *, struct LznaState *) { return -1; }
void LZNA_InitLookup(LznaState *) {}
void BitknitState_Init(BitknitState *) {}
size_t Bitknit_Decode(const byte *, const byte *, byte *, byte *, byte *, BitknitState *) { return 0; }
