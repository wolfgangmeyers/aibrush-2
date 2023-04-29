export class RecentModels {
    private key: string;
    private listSize: number;
  
    constructor(key: string, listSize: number) {
      this.key = key;
      this.listSize = listSize;
    }
  
    private getRecentModels(): string[] {
      const modelsJson = localStorage.getItem(this.key);
      return modelsJson ? JSON.parse(modelsJson) : [];
    }
  
    private saveRecentModels(models: string[]): void {
      localStorage.setItem(this.key, JSON.stringify(models));
    }
  
    addModel(model: string): void {
      const recentModels = this.getRecentModels();
      const modelIndex = recentModels.indexOf(model);
  
      if (modelIndex !== -1) {
        recentModels.splice(modelIndex, 1);
      }
  
      recentModels.unshift(model);
  
      if (recentModels.length > this.listSize) {
        recentModels.pop();
      }
  
      this.saveRecentModels(recentModels);
    }
  
    getModels(): string[] {
      return this.getRecentModels();
    }
  }
  