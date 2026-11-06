import { useEffect, useRef } from 'react';
import { init, use, type EChartsType, type EChartsCoreOption } from 'echarts/core';
import { BarChart, LineChart, TreemapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useChartTheme } from '../chartTheme';
export type EChartsOption = EChartsCoreOption;
use([BarChart, LineChart, TreemapChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);
export function EChart({ option, height, label, onClick }: { option: EChartsOption; height: number; label: string; onClick?: (data: { dataIndex: number; data?: unknown }) => void }) {
  const element = useRef<HTMLDivElement>(null), chart = useRef<EChartsType | null>(null);
  const theme = useChartTheme();
  useEffect(() => {
    const instance = init(element.current!);
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current!);
    return () => { observer.disconnect(); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => { chart.current?.setOption({ ...option, animation: false, aria: { enabled: true, label: { description: label } } }, { notMerge: true }); }, [option, theme, label]);
  useEffect(() => {
    const instance = chart.current!;
    const handler = (data: unknown) => onClick?.(data as { dataIndex: number; data?: unknown });
    instance.on('click', handler);
    return () => { if (!instance.isDisposed()) instance.off('click', handler); };
  }, [onClick]);
  return <div ref={element} role="img" aria-label={label} style={{ height, width: '100%', minWidth: 0 }} />;
}
