import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Copy, Link2, TrendingUp, Users, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function Campaigns() {
  const { toast } = useToast();
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["/api/campaigns"],
    enabled: false,
  });

  const mockCampaigns = [
    {
      id: 1,
      name: "Instagram реклама",
      code: "ref_1_abc123",
      url: "https://t.me/marmeladbot?start=ref_1_abc123",
      isActive: true,
      clicks: 345,
      registrations: 123,
      redemptions: 67,
      createdAt: new Date("2024-02-01"),
    },
    {
      id: 2,
      name: "Партнёрская программа",
      code: "ref_2_xyz789",
      url: "https://t.me/marmeladbot?start=ref_2_xyz789",
      isActive: true,
      clicks: 892,
      registrations: 234,
      redemptions: 156,
      createdAt: new Date("2024-01-15"),
    },
    {
      id: 3,
      name: "Тестовая кампания",
      code: "ref_3_test",
      url: "https://t.me/marmeladbot?start=ref_3_test",
      isActive: false,
      clicks: 12,
      registrations: 3,
      redemptions: 0,
      createdAt: new Date("2024-03-10"),
    },
  ];

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Скопировано!",
      description: `${label} скопирована в буфер обмена`,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-campaigns">
            Реферальные кампании
          </h1>
          <p className="text-muted-foreground">
            Создание и отслеживание реферальных ссылок
          </p>
        </div>
        <Button data-testid="button-create-campaign">
          <Plus className="h-4 w-4 mr-2" />
          Создать кампанию
        </Button>
      </div>

      {mockCampaigns.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <Link2 className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Нет реферальных кампаний</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Создайте первую реферальную кампанию для отслеживания источников трафика
              </p>
            </div>
            <Button data-testid="button-create-first-campaign">
              <Plus className="h-4 w-4 mr-2" />
              Создать первую кампанию
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mockCampaigns.map((campaign) => {
            const conversionRate = campaign.clicks > 0
              ? ((campaign.registrations / campaign.clicks) * 100).toFixed(1)
              : "0.0";
            const redemptionRate = campaign.registrations > 0
              ? ((campaign.redemptions / campaign.registrations) * 100).toFixed(1)
              : "0.0";

            return (
              <Card key={campaign.id} className="hover-elevate" data-testid={`card-campaign-${campaign.id}`}>
                <CardHeader className="space-y-0 pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1">
                      <CardTitle className="text-lg" data-testid={`text-name-${campaign.id}`}>
                        {campaign.name}
                      </CardTitle>
                      <p className="text-xs font-mono text-muted-foreground mt-1" data-testid={`text-code-${campaign.id}`}>
                        {campaign.code}
                      </p>
                    </div>
                    {campaign.isActive ? (
                      <Badge variant="default" data-testid={`badge-status-${campaign.id}`}>Активна</Badge>
                    ) : (
                      <Badge variant="secondary" data-testid={`badge-status-${campaign.id}`}>Неактивна</Badge>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Реферальная ссылка
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={campaign.url}
                        readOnly
                        className="font-mono text-xs"
                        data-testid={`input-url-${campaign.id}`}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(campaign.url, "Ссылка")}
                        data-testid={`button-copy-${campaign.id}`}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="space-y-1">
                      <div className="text-2xl font-bold" data-testid={`text-clicks-${campaign.id}`}>
                        {campaign.clicks}
                      </div>
                      <div className="text-xs text-muted-foreground">Переходов</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold" data-testid={`text-registrations-${campaign.id}`}>
                        {campaign.registrations}
                      </div>
                      <div className="text-xs text-muted-foreground">Регистраций</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold" data-testid={`text-redemptions-${campaign.id}`}>
                        {campaign.redemptions}
                      </div>
                      <div className="text-xs text-muted-foreground">Погашений</div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Конверсия в регистрацию:</span>
                      <div className="flex items-center gap-1 font-medium" data-testid={`text-conversion-${campaign.id}`}>
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span>{conversionRate}%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Погашение скидок:</span>
                      <div className="flex items-center gap-1 font-medium" data-testid={`text-redemption-rate-${campaign.id}`}>
                        <Tag className="h-3 w-3 text-blue-600" />
                        <span>{redemptionRate}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground" data-testid={`text-created-${campaign.id}`}>
                    Создана: {campaign.createdAt.toLocaleDateString("ru-RU")}
                  </div>
                </CardContent>

                <CardFooter className="border-t pt-4">
                  <Button variant="outline" size="sm" className="w-full" data-testid={`button-details-${campaign.id}`}>
                    Подробная статистика
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
