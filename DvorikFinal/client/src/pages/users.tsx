import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, Download, UserPlus, MoreHorizontal, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/users"],
    enabled: false,
  });

  const mockUsers = [
    {
      id: 1,
      telegramId: 123456789,
      username: "@ivan_petrov",
      firstName: "Иван",
      lastName: "Петров",
      isSubscribed: true,
      activeDiscountsCount: 2,
      source: "tgchannel",
      createdAt: new Date("2024-01-15"),
    },
    {
      id: 2,
      telegramId: 987654321,
      username: "@maria_s",
      firstName: "Мария",
      lastName: "Сидорова",
      isSubscribed: false,
      activeDiscountsCount: 0,
      source: "instagram",
      createdAt: new Date("2024-02-20"),
    },
    {
      id: 3,
      telegramId: 456789123,
      username: null,
      firstName: "Алексей",
      lastName: null,
      isSubscribed: true,
      activeDiscountsCount: 1,
      source: "offline",
      createdAt: new Date("2024-03-10"),
    },
  ];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-users">Пользователи</h1>
          <p className="text-muted-foreground">
            Управление клиентами системы лояльности
          </p>
        </div>
        <Button data-testid="button-add-user">
          <UserPlus className="h-4 w-4 mr-2" />
          Добавить вручную
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени, username или Telegram ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-users"
            />
          </div>
          <Button variant="outline" data-testid="button-filter-users">
            <Filter className="h-4 w-4 mr-2" />
            Фильтры
          </Button>
          <Button variant="outline" data-testid="button-export-users">
            <Download className="h-4 w-4 mr-2" />
            Экспорт
          </Button>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Пользователь</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Подписка</TableHead>
              <TableHead>Активные скидки</TableHead>
              <TableHead>Источник</TableHead>
              <TableHead>Дата регистрации</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UserPlus className="h-12 w-12 opacity-50" />
                    <p data-testid="text-no-users">Пользователи не найдены</p>
                    <p className="text-sm">Попробуйте изменить параметры поиска</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              mockUsers.map((user) => (
                <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium" data-testid={`avatar-${user.id}`}>
                        {user.firstName?.[0] || "?"}
                      </div>
                      <div>
                        <div className="font-medium" data-testid={`text-name-${user.id}`}>
                          {[user.firstName, user.lastName].filter(Boolean).join(" ") || "Без имени"}
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid={`text-telegram-id-${user.id}`}>
                          ID: {user.telegramId}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell data-testid={`text-username-${user.id}`}>
                    {user.username ? (
                      <span className="text-muted-foreground">{user.username}</span>
                    ) : (
                      <span className="text-muted-foreground italic">не указан</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.isSubscribed ? (
                      <Badge variant="default" data-testid={`badge-subscribed-${user.id}`}>
                        Подписан
                      </Badge>
                    ) : (
                      <Badge variant="secondary" data-testid={`badge-not-subscribed-${user.id}`}>
                        Не подписан
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono" data-testid={`text-discounts-${user.id}`}>
                      {user.activeDiscountsCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" data-testid={`badge-source-${user.id}`}>{user.source}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground" data-testid={`text-created-${user.id}`}>
                    {user.createdAt.toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-actions-${user.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" data-testid={`dropdown-content-${user.id}`}>
                        <DropdownMenuItem data-testid={`menu-view-${user.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          Просмотр
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
