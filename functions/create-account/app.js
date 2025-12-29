export const handler = async (event) => {
    return {
        statusCode: 501,
        body: JSON.stringify({ 
            message: "Not implemented yet" 
        })
    };
};