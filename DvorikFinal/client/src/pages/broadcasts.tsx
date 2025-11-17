import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Send, Eye, Calendar, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

export default function Broadcasts() {
  const { data: broadcasts, isLoading } = useQuery({
    queryKey: ["/api/broadcasts"],
    enabled: false,
  });

  const mockBroadcasts = [
    {
      id: 1,
      name: "Весенняя акция",
      message: "Получите скидку 20% на все товары!",
      status: "completed",
      totalRecipients: 1234,
      sentCount: 1234,
      failedCount: 0,
      scheduledAt: null,
      createdAt: new Date("2024-03-15"),
    },
    {
      id: 2,
      name: "Поздравление с 8 марта",
      message: "С праздником весны!",
      status: "sending",
      totalRecipients: 856,
      sentCount: 523,
      failedCount: 12,
      scheduledAt: null,
      createdAt: new Date("2024-03-08"),
    },
    {
      id: 3,
      name: "Новая коллекция",
      message: "Встречайте новую коллекцию мармелада!",
      status: "scheduled",
      totalRecipients: 1500,
      sentCount: 0,
      failedCount: 0,
      scheduledAt: new Date("2024-03-25T10:00:00"),
      createdAt: new Date("2024-03-20"),
    },
  ];

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: { variant: "secondary" as const, label: "Черновик" },
      scheduled: { variant: "default" as const, label: "Запланирована" },
      sending: { variant: "default" as const, label: "Отправляется" },
      completed: { variant: "outline" as const, label: "Завершена" },
      failed: { variant: "destructive" as const, label: "Ошибка" },
    };
    return variants[status as keyof typeof variants] || variants.draft;
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
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-broadcasts">
            Рассылки
          </h1>
          <p className="text-muted-foreground">
            Создание и управление массовыми рассылками
          </p>
        </div>
        <Button data-testid="button-create-broadcast">
          <Plus className="h-4 w-4 mr-2" />
          Создать рассылку
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Прогресс</TableHead>
              <TableHead>Получатели</TableHead>
              <TableHead>Запланирована</TableHead>
              <TableHead>Создана</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockBroadcasts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Send className="h-12 w-12 opacity-50" />
                    <p data-testid="text-no-broadcasts">Рассылки не найдены</p>
                    <p className="text-sm">Создайте первую рассылку для ваших пользователей</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              mockBroadcasts.map((broadcast) => {
                const { variant, label } = getStatusBadge(broadcast.status);
                const progress = broadcast.totalRecipients > 0
                  ? (broadcast.sentCount / broadcast.totalRecipients) * 100
                  : 0;

                return (
                  <TableRow key={broadcast.id} data-testid={`row-broadcast-${broadcast.id}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium" data-testid={`text-name-${broadcast.id}`}>
                          {broadcast.name}
                        </div>
                        <div className="text-sm text-muted-foreground line-clamp-1 max-w-md" data-testid={`text-message-${broadcast.id}`}>
                          {broadcast.message}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={variant} data-testid={`badge-status-${broadcast.id}`}>
                        {label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 min-w-[200px]">
                        <Progress value={progress} className="h-2" data-testid={`progress-${broadcast.id}`} />
                        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                          <span data-testid={`text-sent-count-${broadcast.id}`}>
                            {broadcast.sentCount} / {broadcast.totalRecipients}
                          </span>
                          {broadcast.failedCount > 0 && (
                            <span className="text-destructive" data-testid={`text-failed-count-${broadcast.id}`}>
                              {broadcast.failedCount} ошибок
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <UsersIcon className="h-4 w-4" />
                        <span data-testid={`text-recipients-${broadcast.id}`}>
                          {broadcast.totalRecipients.toLocaleString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-scheduled-${broadcast.id}`}>
                      {broadcast.scheduledAt ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>{broadcast.scheduledAt.toLocaleString("ru-RU")}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`text-created-${broadcast.id}`}>
                      {broadcast.createdAt.toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" data-testid={`button-view-${broadcast.id}`}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
