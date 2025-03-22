import axios from "axios";

const api = axios.create({
    baseURL: "/", // Change to your API URL
});
export default api;
