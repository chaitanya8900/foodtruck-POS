/**
 * ESC/POS Command Builder Utility
 * Designed for 80mm standard thermal printers (48 columns font A, 64 columns font B)
 */

export const ESC = 0x1b;
export const GS = 0x1d;
export const FS = 0x1c;
export const LF = 0x0a;

// Standard Paper Widths (in characters)
export const WIDTH_80MM_NORMAL = 48; // Font A (12x24 dots)
export const WIDTH_80MM_DOUBLE = 24; // Font A with 2x width
export const WIDTH_80MM_TRIPLE = 16; // Font A with 3x width
export const WIDTH_80MM_SMALL = 64;  // Font B (9x17 dots)

export const COMMANDS = {
  INIT: Buffer.from([ESC, 0x40]), // ESC @
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]), // ESC a 0
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]), // ESC a 1
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]), // ESC a 2
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]), // ESC E 1
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]), // ESC E 0
  UNDERLINE_ON: Buffer.from([ESC, 0x2d, 0x01]), // ESC - 1
  UNDERLINE_OFF: Buffer.from([ESC, 0x2d, 0x00]), // ESC - 0
  FONT_A: Buffer.from([ESC, 0x4d, 0x00]), // ESC M 0 (Normal)
  FONT_B: Buffer.from([ESC, 0x4d, 0x01]), // ESC M 1 (Small / Condensed)
  SIZE_NORMAL: Buffer.from([GS, 0x21, 0x00]), // GS ! 0
  SIZE_DOUBLE_HEIGHT: Buffer.from([GS, 0x21, 0x01]),
  SIZE_DOUBLE_WIDTH: Buffer.from([GS, 0x21, 0x10]),
  SIZE_DOUBLE: Buffer.from([GS, 0x21, 0x11]), // 2x width + 2x height
  SIZE_TRIPLE: Buffer.from([GS, 0x21, 0x22]), // 3x width + 3x height
  SIZE_QUADRUPLE: Buffer.from([GS, 0x21, 0x33]),
  CUT_FULL: Buffer.from([GS, 0x56, 0x41, 0x00]), // GS V 65 0
  CUT_PARTIAL: Buffer.from([GS, 0x56, 0x42, 0x00]), // GS V 66 0
  LF: Buffer.from([LF]),
};

export class EscPosBuilder {
  private buffers: Buffer[] = [];

  constructor() {
    this.add(COMMANDS.INIT);
  }

  public add(buf: Buffer): this {
    this.buffers.push(buf);
    return this;
  }

  public initialize(): this {
    return this.add(COMMANDS.INIT);
  }

  public leftAlign(): this {
    return this.add(COMMANDS.ALIGN_LEFT);
  }

  public centerAlign(): this {
    return this.add(COMMANDS.ALIGN_CENTER);
  }

  public rightAlign(): this {
    return this.add(COMMANDS.ALIGN_RIGHT);
  }

  public bold(on = true): this {
    return this.add(on ? COMMANDS.BOLD_ON : COMMANDS.BOLD_OFF);
  }

  public underline(on = true): this {
    return this.add(on ? COMMANDS.UNDERLINE_ON : COMMANDS.UNDERLINE_OFF);
  }

  public normalSize(): this {
    return this.add(COMMANDS.FONT_A).add(COMMANDS.SIZE_NORMAL);
  }

  public doubleSize(on = true): this {
    return this.add(on ? COMMANDS.SIZE_DOUBLE : COMMANDS.SIZE_NORMAL);
  }

  public tripleSize(on = true): this {
    return this.add(on ? COMMANDS.SIZE_TRIPLE : COMMANDS.SIZE_NORMAL);
  }

  public largeSize(on = true): this {
    return this.doubleSize(on);
  }

  public smallText(on = true): this {
    return this.add(on ? COMMANDS.FONT_B : COMMANDS.FONT_A);
  }

  public textSize(widthMultiplier: number, heightMultiplier: number): this {
    const w = Math.min(Math.max(widthMultiplier - 1, 0), 7);
    const h = Math.min(Math.max(heightMultiplier - 1, 0), 7);
    const n = (w << 4) | h;
    return this.add(Buffer.from([GS, 0x21, n]));
  }

  public feed(lines = 1): this {
    if (lines <= 0) return this;
    if (lines === 1) return this.add(COMMANDS.LF);
    return this.add(Buffer.from([ESC, 0x64, Math.min(lines, 255)])); // ESC d n
  }

  public cut(partial = true): this {
    // Feed 3 lines before cut so the printed text clears the cutter
    this.feed(3);
    return this.add(partial ? COMMANDS.CUT_PARTIAL : COMMANDS.CUT_FULL);
  }

  public text(str: string): this {
    return this.add(Buffer.from(str, 'utf8'));
  }

  public printLine(str = ''): this {
    return this.text(str).add(COMMANDS.LF);
  }

  public separator(char = '_', width = WIDTH_80MM_NORMAL): this {
    const line = char.repeat(width);
    return this.printLine(line);
  }

  public printColumns(left: string, right: string, width = WIDTH_80MM_NORMAL): this {
    const leftTrimmed = left;
    const rightTrimmed = right;
    const totalContentLength = leftTrimmed.length + rightTrimmed.length;

    if (totalContentLength < width) {
      const spaces = ' '.repeat(width - totalContentLength);
      return this.printLine(`${leftTrimmed}${spaces}${rightTrimmed}`);
    } else if (totalContentLength === width) {
      return this.printLine(`${leftTrimmed}${rightTrimmed}`);
    } else {
      // If combined text overflows the line width, give priority to right column and wrap left
      const maxLeftWidth = width - rightTrimmed.length - 1;
      if (maxLeftWidth > 5) {
        const line1Left = leftTrimmed.slice(0, maxLeftWidth);
        const line2Left = '  ' + leftTrimmed.slice(maxLeftWidth);
        const spaces = ' '.repeat(width - line1Left.length - rightTrimmed.length);
        this.printLine(`${line1Left}${spaces}${rightTrimmed}`);
        return this.printLine(line2Left);
      } else {
        this.printLine(leftTrimmed);
        const spaces = ' '.repeat(Math.max(width - rightTrimmed.length, 0));
        return this.printLine(`${spaces}${rightTrimmed}`);
      }
    }
  }

  public build(): Buffer {
    return Buffer.concat(this.buffers);
  }
}

// Standalone Helper functions
export function initialize(): Buffer {
  return COMMANDS.INIT;
}

export function centerAlign(): Buffer {
  return COMMANDS.ALIGN_CENTER;
}

export function leftAlign(): Buffer {
  return COMMANDS.ALIGN_LEFT;
}

export function rightAlign(): Buffer {
  return COMMANDS.ALIGN_RIGHT;
}

export function bold(on = true): Buffer {
  return on ? COMMANDS.BOLD_ON : COMMANDS.BOLD_OFF;
}

export function underline(on = true): Buffer {
  return on ? COMMANDS.UNDERLINE_ON : COMMANDS.UNDERLINE_OFF;
}

export function doubleSize(on = true): Buffer {
  return on ? COMMANDS.SIZE_DOUBLE : COMMANDS.SIZE_NORMAL;
}

export function tripleSize(on = true): Buffer {
  return on ? COMMANDS.SIZE_TRIPLE : COMMANDS.SIZE_NORMAL;
}

export function smallText(on = true): Buffer {
  return on ? COMMANDS.FONT_B : COMMANDS.FONT_A;
}

export function cut(partial = true): Buffer {
  const feedBuf = Buffer.from([ESC, 0x64, 3]);
  const cutBuf = partial ? COMMANDS.CUT_PARTIAL : COMMANDS.CUT_FULL;
  return Buffer.concat([feedBuf, cutBuf]);
}

export function feed(lines = 1): Buffer {
  if (lines <= 0) return Buffer.alloc(0);
  if (lines === 1) return COMMANDS.LF;
  return Buffer.from([ESC, 0x64, Math.min(lines, 255)]);
}

export function printLine(text = ''): Buffer {
  return Buffer.concat([Buffer.from(text, 'utf8'), COMMANDS.LF]);
}

export function separator(char = '_', width = WIDTH_80MM_NORMAL): Buffer {
  return printLine(char.repeat(width));
}

export function printColumns(left: string, right: string, width = WIDTH_80MM_NORMAL): Buffer {
  const totalContentLength = left.length + right.length;
  if (totalContentLength < width) {
    const spaces = ' '.repeat(width - totalContentLength);
    return printLine(`${left}${spaces}${right}`);
  }
  const maxLeft = Math.max(width - right.length - 1, 5);
  const leftPart = left.slice(0, maxLeft);
  const remaining = left.slice(maxLeft);
  const spaces = ' '.repeat(Math.max(width - leftPart.length - right.length, 1));
  const line1 = Buffer.concat([Buffer.from(`${leftPart}${spaces}${right}`, 'utf8'), COMMANDS.LF]);
  if (remaining.trim()) {
    const line2 = Buffer.concat([Buffer.from(`  ${remaining}`, 'utf8'), COMMANDS.LF]);
    return Buffer.concat([line1, line2]);
  }
  return line1;
}

export function combineBuffers(...buffers: (Buffer | undefined | null)[]): Buffer {
  return Buffer.concat(buffers.filter((b): b is Buffer => Buffer.isBuffer(b)));
}
