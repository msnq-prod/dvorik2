import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Logs() {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["/api/logs", eventTypeFilter],
    enabled: false,
  });

  const mockLogs = [
    {
      id: 1,
      eventType: "discount_redeemed",
      message: "Код АБВ1234 успешно погашен",
      userName: "Иван Петров (@ivan_petrov)",
      cashierName: "Мария Продавцова",
      metadata: { code: "АБВ1234", discount: "10%" },
      createdAt: new Date("2024-03-20T14:30:00"),
    },
    {
      id: 2,
      eventType: "user_registered",
      message: "Новый пользователь зарегистрирован",
      userName: "Алексей Новиков",
      cashierName: null,
      metadata: { source: "instagram", telegramId: 123456789 },
      createdAt: new Date("2024-03-20T14:15:00"),
    },
    {
      id: 3,
      eventType: "discount_issued",
      message: "Выдана скидка за подписку",
      userName: "Мария Сидорова (@maria_s)",
      cashierName: null,
      metadata: { code: "ГДЕ5678", template: "subscription_default" },
      createdAt: new Date("2024-03-20T13:45:00"),
    },
    {
      id: 4,
      eventType: "discount_redemption_attempt",
      message: "Попытка погашения истёкшего кода",
      userName: "Пётр Иванов",
      cashierName: "Иван Кассиров",
      metadata: { code: "ЖЗИ9012", reason: "expired" },
      createdAt: new Date("2024-03-20T13:20:00"),
    },
    {
      id: 5,
      eventType: "broadcast_sent",
      message: "Рассылка 'Весенняя акция' отправлена",
      userName: null,
      cashierName: null,
      metadata: { broadcastId: 1, recipients: 1234 },
      createdAt: new Date("2024-03-20T10:00:00"),
    },
  ];

  const getEventBadge = (eventType: string) => {
    const variants = {
      user_registered: { variant: "default" as const, label: "Регистрация" },
      discount_issued: { variant: "default" as const, label: "Скидка выдана" },
      discount_redeemed: { variant: "outline" as const, label: "Погашение" },
      discount_redemption_attempt: { variant: "secondary" as const, label: "Попытка погашения" },
      broadcast_sent: { variant: "default" as const, label: "Рассылка" },
      cashier_approved: { variant: "default" as const, label: "Кассир подтверждён" },
      error: { variant: "destructive" as const, label: "Ошибка" },
    };
    return variants[eventType as keyof typeof variants] || { variant: "secondary" as const, label: eventType };
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-logs">
            Логи и отчёты
          </h1>
          <p className="text-muted-foreground">
            История всех событий системы
          </p>
        </div>
        <Button variant="outline" data-testid="button-export-logs">
          <Download className="h-4 w-4 mr-2" />
          Экспорт
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по событиям..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-logs"
            />
          </div>
          <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-event-type">
              <SelectValue placeholder="Тип события" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="select-item-all">Все события</SelectItem>
              <SelectItem value="user_registered" data-testid="select-item-registered">Регистрации</SelectItem>
              <SelectItem value="discount_issued" data-testid="select-item-issued">Скидки выданы</SelectItem>
              <SelectItem value="discount_redeemed" data-testid="select-item-redeemed">Погашения</SelectItem>
              <SelectItem value="broadcast_sent" data-testid="select-item-broadcast">Рассылки</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="space-y-3">
        {mockLogs.length === 0 ? (
          <Card className="p-12">
            <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
              <FileText className="h-12 w-12 opacity-50" />
              <p data-testid="text-no-logs">Логи не найдены</p>
              <p className="text-sm">Попробуйте изменить фильтры</p>
            </div>
          </Card>
        ) : (
          mockLogs.map((log) => {
            const { variant, label } = getEventBadge(log.eventType);

            return (
              <Card key={log.id} className="p-4 hover-elevate" data-testid={`log-entry-${log.id}`}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={variant} data-testid={`badge-type-${log.id}`}>
                            {label}
                          </Badge>
                          <span className="text-sm text-muted-foreground" data-testid={`text-time-${log.id}`}>
                            {log.createdAt.toLocaleString("ru-RU")}
                          </span>
                        </div>
                        <p className="font-medium mt-1" data-testid={`text-message-${log.id}`}>
                          {log.message}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {log.userName && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Пользователь:</span>
                          <span data-testid={`text-user-${log.id}`}>{log.userName}</span>
                        </div>
                      )}
                      {log.cashierName && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Кассир:</span>
                          <span data-testid={`text-cashier-${log.id}`}>{log.cashierName}</span>
                        </div>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details className="cursor-pointer">
                          <summary className="text-primary hover:underline" data-testid={`button-metadata-${log.id}`}>
                            Подробности
                          </summary>
                          <pre className="mt-2 p-2 bg-muted rounded-md text-xs overflow-x-auto" data-testid={`text-metadata-${log.id}`}>
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
