import { useState } from 'react';
import { useUserRoles, type UserWithRoles, type AppRole } from '@/hooks/use-user-roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Shield, UserCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function UserManagement() {
  const { users, loading, addRole, removeRole } = useUserRoles();
  const [processingUser, setProcessingUser] = useState<string | null>(null);
  const { toast } = useToast();

  const handleToggleRole = async (user: UserWithRoles, role: AppRole) => {
    setProcessingUser(user.user_id);
    
    const hasRole = user.roles.includes(role);
    const result = hasRole 
      ? await removeRole(user.user_id, role)
      : await addRole(user.user_id, role);

    if (result.success) {
      toast({
        title: hasRole ? 'Role removed' : 'Role added',
        description: `${role} role ${hasRole ? 'removed from' : 'granted to'} ${user.email}`,
      });
    } else {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      });
    }
    
    setProcessingUser(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCircle className="h-5 w-5" />
          User Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.user_id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {user.roles.map((role) => (
                      <Badge
                        key={role}
                        variant={role === 'admin' ? 'default' : 'secondary'}
                      >
                        {role === 'admin' && <Shield className="mr-1 h-3 w-3" />}
                        {role}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {new Date(user.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant={user.roles.includes('admin') ? 'destructive' : 'default'}
                    size="sm"
                    onClick={() => handleToggleRole(user, 'admin')}
                    disabled={processingUser === user.user_id}
                  >
                    {processingUser === user.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : user.roles.includes('admin') ? (
                      'Remove Admin'
                    ) : (
                      'Make Admin'
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
