export async function fetchDataFromBackend(endpoint) {
    const response = await fetch(`/api/${endpoint}`);
    return response.json();
}
