import { NativeModules } from 'react-native';

export interface InstalledApp {
  packageName: string;
  appName: string;
  icon?: string; // base64 PNG, no data: prefix
}

export interface BlockingState {
  active: boolean;
  indefinitelyDisabled: boolean;
  /** epoch ms the temporary disable ends at, or 0 if not temporarily disabled */
  tempDisabledUntil: number;
}

interface AppBlockerModuleType {
  hasPasswordsSet(): Promise<boolean>;
  setupPasswords(longPw: string, masterPw: string): Promise<boolean>;
  verifyLongPassword(pw: string): Promise<boolean>;
  verifyMasterPassword(pw: string): Promise<boolean>;
  changeLongPassword(masterPw: string, newLongPw: string): Promise<boolean>;
  changeMasterPassword(currentMasterPw: string, newMasterPw: string): Promise<boolean>;

  getInstalledApps(): Promise<InstalledApp[]>;
  getBlockedApps(): Promise<string[]>;
  setBlockedApps(packages: string[]): Promise<boolean>;

  getBlockingState(): Promise<BlockingState>;
  disableBlockingTemporarily(longPw: string): Promise<number>;
  disableBlockingWithMasterPassword(masterPw: string): Promise<boolean>;
  enableBlocking(): Promise<boolean>;

  isAccessibilityServiceEnabled(): Promise<boolean>;
  openAccessibilitySettings(): void;

  isDeviceAdminActive(): Promise<boolean>;
  requestDeviceAdmin(): void;

  isShizukuInstalled(): Promise<boolean>;
  isShizukuPermissionGranted(): Promise<boolean>;
  requestShizukuPermission(): void;

  startProtectionService(): void;
  openAppSettings(): void;
}

const { AppBlockerModule } = NativeModules as { AppBlockerModule: AppBlockerModuleType };

export default AppBlockerModule;
