const PRINT_WIDTH = process.env.CONSOLE_PRINT_HEADER_WIDTH ? parseInt(process.env.CONSOLE_PRINT_HEADER_WIDTH) : 50;

function consolePrintHeader(text = '', fillChar = '=') {
    if (!text) {
        console.log(fillChar.repeat(PRINT_WIDTH));
        return;
    }
    const label = String(text).trim();
    const padding = Math.max(PRINT_WIDTH - label.length - 2, 6);
    const left = Math.floor(padding / 2);
    const right = padding - left;
    console.log(`${fillChar.repeat(left)} ${label} ${fillChar.repeat(right)}`);
}

function consolePrintError(input, customErrorTitle = null) {
    if (!input) return;
    const errorTitle = customErrorTitle || input.message || 'Error';
    consolePrintHeader(errorTitle, '@');
    console.error(input);
    consolePrintHeader('', '@');
}

module.exports = { consolePrintHeader, consolePrintError };