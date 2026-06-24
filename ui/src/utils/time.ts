export function formatGameTime(minutes: number): { timeStr: string; dayStr: string; isNight: boolean } {
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const day = Math.floor(minutes / 1440) + 1;
  const isNight = h >= 20 || h < 6;
  return {
    timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    dayStr: `Day ${day}`,
    isNight,
  };
}
