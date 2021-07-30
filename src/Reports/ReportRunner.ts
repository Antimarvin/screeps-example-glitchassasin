import FranchiseReport from "./FranchiseReport";

declare global {
    namespace NodeJS {
        interface Global {
            d: (key: string) => void
        }
    }
}

const allReports: Record<string, CallableFunction> = {};

let activeReport = '';

export const register = (key: string, runner: CallableFunction) => {
    allReports[key] = runner;
}

export const run = () => {
    allReports[activeReport]?.();
}

global.d = (key: string) => {
    activeReport = key;
}

register('franchises', FranchiseReport);
