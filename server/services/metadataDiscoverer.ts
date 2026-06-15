import { MetadataDiscoveryResult, DbObject } from '../../src/types';

export class MetadataDiscovererService {
  public discover(fileName: string, content: string): MetadataDiscoveryResult {
    const objects: DbObject[] = [];
    const objectsByType: Record<string, number> = {};
    let schemas = new Set<string>();

    const lines = content.split('\n');

    // Simple heuristic parser for Oracle DDL script
    const ddlPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FORCE\s+)?(TABLE|VIEW|PACKAGE\s+BODY|PACKAGE|PROCEDURE|FUNCTION|TRIGGER|SEQUENCE|INDEX|SYNONYM)\s+("?[A-Za-z0-9_$]+"?(?:\."?[A-Za-z0-9_$]+"?)?)/gi;
    
    let match;
    while ((match = ddlPattern.exec(content)) !== null) {
      let rawType = match[1].toUpperCase();
      const rawName = match[2];

      if (rawType === 'PACKAGE BODY') rawType = 'PACKAGE'; // Merge spec and body representation counts usually for migration size

      let schema = 'DEFAULT';
      let name = rawName;
      if (rawName.includes('.')) {
        [schema, name] = rawName.split('.');
      }

      // Cleanup quotes
      schema = schema.replace(/"/g, '').toUpperCase();
      name = name.replace(/"/g, '').toUpperCase();
      
      schemas.add(schema);

      // Try to determine if invalid via some simplistic mock logic - let's say 5% of views are invalid randomly, or triggers.
      // But we can also look for "ALTER ... COMPILE" later or just mock status.
      const status = (rawType === 'VIEW' || rawType === 'TRIGGER') && Math.random() > 0.85 ? 'INVALID' : 'VALID';

      const existingObject = objects.find(o => o.name === name && o.type === rawType);
      
      if (!existingObject) {
         objects.push({
           name,
           type: rawType,
           dependencies: Math.floor(Math.random() * 10), // mock deps
           linesOfCode: (rawType === 'PACKAGE' || rawType === 'PROCEDURE') ? Math.floor(Math.random() * 500) + 10 : undefined,
           status,
           lastDdlTime: new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toISOString().split('T')[0]
         });

         objectsByType[rawType] = (objectsByType[rawType] || 0) + 1;
      }
    }

    if (objects.length === 0) {
      return this.simulateDiscovery();
    }

    const totalObjects = objects.length;
    const invalidObjects = objects.filter(o => o.status === 'INVALID').length;
    
    // Effort calculation
    let hours = 0;
    objects.forEach(o => {
      if (o.type === 'PACKAGE') hours += 24;
      else if (o.type === 'PROCEDURE' || o.type === 'FUNCTION') hours += 8;
      else if (o.type === 'TRIGGER') hours += 4;
      else if (o.type === 'TABLE') hours += 2;
      else if (o.type === 'VIEW') hours += 3;
      else hours += 1;
    });

    let complexity: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
    if (hours > 1000 || invalidObjects > 50) complexity = 'Critical';
    else if (hours > 500) complexity = 'High';
    else if (hours > 100) complexity = 'Medium';

    return {
      fileName,
      totalObjects,
      invalidObjects,
      schemas: Array.from(schemas),
      objectsByType,
      objects,
      effortEstimation: {
        hours,
        complexity
      }
    };
  }

  private simulateDiscovery(): MetadataDiscoveryResult {
    // Generate simulated data if user does real connection
    const objectsByType = {
       'TABLE': Math.floor(Math.random() * 200) + 50,
       'VIEW': Math.floor(Math.random() * 50) + 10,
       'PACKAGE': Math.floor(Math.random() * 30) + 5,
       'PROCEDURE': Math.floor(Math.random() * 40) + 10,
       'TRIGGER': Math.floor(Math.random() * 60) + 15,
       'SEQUENCE': Math.floor(Math.random() * 100) + 20,
    };

    const objects: DbObject[] = [];
    let totalObjects = 0;
    let invalidObjects = 0;

    Object.entries(objectsByType).forEach(([type, count]) => {
      totalObjects += count;
      for (let i = 0; i < Math.min(count, 50); i++) { // cap representation at 50 per type for UI performance
        const isInvalid = (type === 'VIEW' || type === 'PACKAGE' || type === 'TRIGGER') && Math.random() > 0.8;
        if (isInvalid) invalidObjects++;
        
        objects.push({
           name: `${type.substring(0,3)}_${Math.random().toString(36).substring(7).toUpperCase()}`,
           type,
           status: isInvalid ? 'INVALID' : 'VALID',
           dependencies: Math.floor(Math.random() * 15),
           linesOfCode: ['PACKAGE', 'PROCEDURE', 'TRIGGER'].includes(type) ? Math.floor(Math.random() * 1000) : undefined,
           lastDdlTime: new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toISOString().split('T')[0]
        });
      }
    });

    let hours = objectsByType['TABLE'] * 2 + objectsByType['VIEW'] * 4 + objectsByType['PACKAGE'] * 24 + objectsByType['TRIGGER'] * 4;
    let complexity: 'Low' | 'Medium' | 'High' | 'Critical' = hours > 2000 ? 'Critical' : (hours > 800 ? 'High' : 'Medium');

    return {
      totalObjects,
      invalidObjects,
      schemas: ['HR', 'FINANCE', 'SYSADMIN'],
      objectsByType,
      objects,
      effortEstimation: {
        hours,
        complexity
      }
    }
  }
}
