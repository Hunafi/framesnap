import { useState } from 'react';
import { useUserManagement, type UserProfile, type AppRole } from '@/hooks/use-user-management';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function UserManagement() {
  const { users, loading, updateUserRole } = useUserManagement();
  const [processingUser, setProcessingUser] = useState<string | null>(null);
  const { toast } = useToast();

  const handleRoleChange = async (user: UserProfile, newRole: AppRole) => {
    setProcessingUser(user.user_id);
    
    const result = await updateUserRole(user.user_id, newRole);

    if (result.success) {
      toast({
        title: 'Role updated',
        description: `${user.email} is now a ${newRole}`,
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
              <TableHead>Current Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Change Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.user_id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>
                  <Badge
                    variant={user.role === 'admin' ? 'default' : 'secondary'}
                  >
                    {user.role === 'admin' && <Shield className="mr-1 h-3 w-3" />}
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Date(user.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Select
                    value={user.role}
                    onValueChange={(value: AppRole) => handleRoleChange(user, value)}
                    disabled={processingUser === user.user_id}
                  >
                    <SelectTrigger className="w-32">
                      {processingUser === user.user_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <SelectValue />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
