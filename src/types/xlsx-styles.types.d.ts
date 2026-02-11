declare module "xlsx-style" {
  type utils = any;
  

  interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: WorkSheet };
  }

  interface WorkSheet {
    [cell: string]: CellObject | any;
  }

  interface CellObject {
    v?: string | number | boolean | Date;
    w?: string;
    t?: string;
    f?: string;
    F?: string;
    r?: string;
    h?: string;
    c?: Comment[];
    z?: string;
    l?: Hyperlink;
    s?: Style;
  }

  interface Comment {
    a: string;
    t: string;
  }

  interface Hyperlink {
    Target: string;
    Tooltip?: string;
  }

  interface Style {
    font?: Font;
    fill?: Fill;
    alignment?: Alignment;
    border?: Border;
    numFmt?: string;
  }

  interface Font {
    name?: string;
    sz?: number;
    color?: { rgb: string };
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  }

  interface Fill {
    fgColor?: { rgb: string };
    bgColor?: { rgb: string };
    patternType?: string;
  }

  interface Alignment {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
  }

  interface Border {
    top?: BorderStyle;
    bottom?: BorderStyle;
    left?: BorderStyle;
    right?: BorderStyle;
  }

  interface BorderStyle {
    style: string;
    color?: { rgb: string };
  }

  function readFile(filename: string, opts?: any): WorkBook;
  function writeFile(workbook: WorkBook, filename: string, opts?: any): void;
  function write(workbook: WorkBook, opts?: any): any;
  function read(data: any, opts?: any): WorkBook;
}
