export function success(data: unknown, statusCode: number = 200) {
    return {
        statusCode,
        body: JSON.stringify(data)
    }
}

export function error(message: string, statusCode = 500, extra = {}) {
  return {
    statusCode,
    body: JSON.stringify({ error: message, ...extra })
  }
}
