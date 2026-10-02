declare function qrcode(typeNumber: number, errorCorrectionLevel: string): {
    addData(data: string): void;
    make(): void;
    createDataURL(cellSize?: number, margin?: number): string;
};

export default qrcode;
