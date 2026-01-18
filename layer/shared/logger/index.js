export const logger = {
    info: (message, context = {}) => {
        console.log(JSON.stringify({
            level: 'INFO',
            timestamp: new Date().toISOString(),
            message,
            ...context
        }))
    },

    error: (message, error, context = {}) => {
        console.error(JSON.stringify({
            level: 'ERROR',
            timestamp: new Date().toISOString(),
            message,
            error: error?.message,
            stack: error?.stack,
            ...context
        }))
    }
}
