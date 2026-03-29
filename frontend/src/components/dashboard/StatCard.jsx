import React from 'react';
import { Card, CardContent } from '../ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

const computeTrend = (trend) => {
    if (!trend || trend.previous === undefined) return null;
    if (trend.previous === 0 && trend.current > 0) return { type: 'new', label: 'New this month' };
    if (trend.previous === 0) return null;

    const pct = ((trend.current - trend.previous) / trend.previous * 100).toFixed(1);
    if (Number(pct) > 0) return { type: 'up', label: `+${pct}% from last month` };
    if (Number(pct) < 0) return { type: 'down', label: `${pct}% from last month` };
    return { type: 'neutral', label: 'No change from last month' };
};

const StatCard = ({ title, value, subtitle, icon: Icon, color = 'primary', trend }) => {
    const trendData = computeTrend(trend);

    return (
        <Card className="industrial-card stat-card-accent" data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">{title}</p>
                <div className="flex items-center justify-between">
                    <p className="font-display text-2xl lg:text-3xl font-bold">{value}</p>
                    <div className={`p-2.5 bg-${color}/10 rounded-sm border border-${color}/20`}>
                        <Icon className={`w-5 h-5 text-${color}`} />
                    </div>
                </div>
                <div className="mt-2">
                    {trendData ? (
                        <div className={`flex items-center gap-1 text-xs font-medium ${
                            trendData.type === 'up' ? 'text-green-400' :
                            trendData.type === 'down' ? 'text-red-400' :
                            trendData.type === 'new' ? 'text-primary' :
                            'text-muted-foreground'
                        }`}>
                            {trendData.type === 'up' && <TrendingUp className="w-3.5 h-3.5" />}
                            {trendData.type === 'down' && <TrendingDown className="w-3.5 h-3.5" />}
                            {trendData.label}
                        </div>
                    ) : subtitle ? (
                        <p className="text-xs text-muted-foreground">{subtitle}</p>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    );
};

export default StatCard;
