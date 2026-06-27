import { AdminConfig } from './admin.types';

export interface PlayRecord {
  title: string;
  source_name: string;
  cover: string;
  year: string;
  index: number;
  total_episodes: number;
  play_time: number;
  total_time: number;
  save_time: number;
  search_title: string;
}

export interface Favorite {
  source_name: string;
  total_episodes: number;
  title: string;
  year: string;
  cover: string;
  save_time: number;
  search_title: string;
}

export interface PendingEmailRegistration {
  username: string;
  email: string;
  password: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
}

export interface IStorage {
  getPlayRecord(userName: string, key: string): Promise<PlayRecord | null>;
  setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void>;
  getAllPlayRecords(userName: string): Promise<{ [key: string]: PlayRecord }>;
  deletePlayRecord(userName: string, key: string): Promise<void>;

  getFavorite(userName: string, key: string): Promise<Favorite | null>;
  setFavorite(userName: string, key: string, favorite: Favorite): Promise<void>;
  getAllFavorites(userName: string): Promise<{ [key: string]: Favorite }>;
  deleteFavorite(userName: string, key: string): Promise<void>;

  registerUser(
    userName: string,
    password: string,
    email?: string | null
  ): Promise<void>;
  verifyUser(userName: string, password: string): Promise<boolean>;
  checkEmailExist?(email: string): Promise<boolean>;
  createEmailRegistration?(
    userName: string,
    email: string,
    password: string,
    tokenHash: string,
    expiresAt: number
  ): Promise<void>;
  getEmailRegistrationByTokenHash?(
    tokenHash: string
  ): Promise<PendingEmailRegistration | null>;
  deleteEmailRegistration?(email: string): Promise<void>;
  checkUserExist(userName: string): Promise<boolean>;
  changePassword(userName: string, newPassword: string): Promise<void>;
  deleteUser(userName: string): Promise<void>;

  getSearchHistory(userName: string): Promise<string[]>;
  addSearchHistory(userName: string, keyword: string): Promise<void>;
  deleteSearchHistory(userName: string, keyword?: string): Promise<void>;

  getAllUsers(): Promise<string[]>;

  getAdminConfig(): Promise<AdminConfig | null>;
  setAdminConfig(config: AdminConfig): Promise<void>;

  getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null>;
  setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void>;
  deleteSkipConfig(userName: string, source: string, id: string): Promise<void>;
  getAllSkipConfigs(userName: string): Promise<{ [key: string]: SkipConfig }>;
}

export interface SearchResult {
  id: string;
  title: string;
  poster: string;
  episodes: string[];
  total_episodes?: number;
  source: string;
  source_name: string;
  class?: string;
  year: string;
  score?: string;
  desc?: string;
  type_name?: string;
  douban_id?: number;
}

export interface DoubanItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
}

export interface DoubanResult {
  code: number;
  message: string;
  list: DoubanItem[];
}

export interface SkipConfig {
  enable: boolean;
  intro_time: number;
  outro_time: number;
}
