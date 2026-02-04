import { AppError } from "../errors/AppError.js"

export const logger = {
    info: (message: string, context: Record<string, unknown> = {}) => {
        console.log(JSON.stringify({
            level: 'INFO',
            timestamp: new Date().toISOString(),
            message,
            ...context
        }))
    },

    error: (message: string, error: unknown, context: Record<string, unknown> = {}) => {
        let errorInfo: Record<string, unknown> = {};
        
        if (error instanceof Error) {
            errorInfo = { error: error.message, stack: error.stack };
        } else if (error !== undefined && error !== null) {
            errorInfo = { error: String(error) };
        }

        console.error(JSON.stringify({
            level: 'ERROR',
            timestamp: new Date().toISOString(),
            message,
            ...errorInfo,
            ...context
        }));
    }
}
