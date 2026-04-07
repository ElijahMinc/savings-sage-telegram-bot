import tzLookup from "tz-lookup";
import { isValidReminderTimezone } from "@/helpers/reminderSchedule.helper";

const isValidCoordinate = (value: number, min: number, max: number) => {
  return Number.isFinite(value) && value >= min && value <= max;
};

export const getTimezoneFromCoordinates = (
  latitude: number,
  longitude: number,
) => {
  if (
    !isValidCoordinate(latitude, -90, 90) ||
    !isValidCoordinate(longitude, -180, 180)
  ) {
    return null;
  }

  try {
    const timezone = tzLookup(latitude, longitude);
    return isValidReminderTimezone(timezone) ? timezone : null;
  } catch (error) {
    console.error("Error resolving timezone from coordinates:", error);
    return null;
  }
};
