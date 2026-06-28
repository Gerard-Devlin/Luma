export interface AdminConfig {
  SiteConfig: {
    SiteName: string;
    Announcement: string;
    SiteInterfaceCacheTime: number;
  };
  UserConfig: {
    AllowRegister: boolean;
    Users: {
      username: string;
      role: 'user' | 'admin' | 'owner';
      banned?: boolean;
    }[];
  };
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}
