import { 
  Home, 
  Users, 
  Tag, 
  UserCheck, 
  Megaphone, 
  Link2, 
  FileText, 
  Settings,
  LogOut
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

// Navigation items with role-based visibility
const menuItems = {
  main: [
    {
      title: "Главная",
      url: "/",
      icon: Home,
      roles: ["owner", "marketing", "readonly"],
    },
    {
      title: "Пользователи",
      url: "/users",
      icon: Users,
      roles: ["owner", "marketing", "readonly"],
    },
    {
      title: "Шаблоны скидок",
      url: "/discount-templates",
      icon: Tag,
      roles: ["owner", "marketing"],
    },
    {
      title: "Кассиры",
      url: "/cashiers",
      icon: UserCheck,
      roles: ["owner"],
    },
  ],
  marketing: [
    {
      title: "Рассылки",
      url: "/broadcasts",
      icon: Megaphone,
      roles: ["owner", "marketing"],
    },
    {
      title: "Реферальные кампании",
      url: "/campaigns",
      icon: Link2,
      roles: ["owner", "marketing"],
    },
  ],
  system: [
    {
      title: "Логи и отчёты",
      url: "/logs",
      icon: FileText,
      roles: ["owner", "marketing", "readonly"],
    },
    {
      title: "Настройки",
      url: "/settings",
      icon: Settings,
      roles: ["owner"],
    },
  ],
};

export function AppSidebar() {
  const [location] = useLocation();
  // TODO: Get user role from context/auth
  const userRole = "owner"; // For now, assume owner role

  const canSeeItem = (roles: string[]) => roles.includes(userRole);

  return (
    <Sidebar data-testid="sidebar-navigation">
      <SidebarContent>
        <div className="flex items-center gap-2 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <span className="text-lg font-bold text-primary-foreground">МД</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Мармеладный</span>
            <span className="text-xs text-muted-foreground">дворик</span>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Управление</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.main.filter(item => canSeeItem(item.roles)).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.url.replace('/', '') || 'home'}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Маркетинг</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.marketing.filter(item => canSeeItem(item.roles)).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.url.replace('/', '')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Система</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.system.filter(item => canSeeItem(item.roles)).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.url.replace('/', '')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton data-testid="button-logout">
              <LogOut className="h-4 w-4" />
              <span>Выход</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
