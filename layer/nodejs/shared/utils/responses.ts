export function success(data: unknown, statusCode: number = 200) {
    return {
        statusCode,
        body: JSON.stringify(data)
    }
}

export function error(message: string, statusCode: number = 500) {
    return {
        statusCode,
        body: JSON.stringify({ error: message })
    }
}
