export function success(data, statusCode = 200) {
    return {
        statusCode,
        body: JSON.stringify(data)
    }
}

export function error(message, statusCode = 500) {
    return {
        statusCode,
        body: JSON.stringify({ error: message })
    }
}
