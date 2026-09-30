import { useEffect, useState } from "react";

/** Текущий месяц программы и автопрокрутка времени; общий для всех вариантов. */
export function usePlayback(lastMonth: number, startMonth = 0) {
  const [month, setMonth] = useState(startMonth);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (month > lastMonth) setMonth(lastMonth);
  }, [lastMonth, month]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setMonth((current) => {
        if (current >= lastMonth) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 420);
    return () => window.clearInterval(timer);
  }, [lastMonth, playing]);

  const toggle = () => {
    if (!playing && month >= lastMonth) setMonth(0);
    setPlaying((value) => !value);
  };

  return { month, setMonth: (value: number) => { setPlaying(false); setMonth(value); }, playing, toggle };
}
