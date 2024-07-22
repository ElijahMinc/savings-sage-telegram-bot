import axios from "axios";

export const getTimezone = async () => {
  try {
    const response = await axios.get("https://ipapi.co/json/");
    return response.data.timezone;
  } catch (error) {
    console.error("Error fetching timezone:", error);
    return "UTC"; // Default timezone
  }
};
