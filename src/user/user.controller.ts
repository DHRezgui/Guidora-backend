import { 
  Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe, HttpException,} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UserRole } from './entities/user.entity';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('user')  
export class UserController {
  constructor(
    private readonly userService: UserService,
  ) {}

  // Inscription
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.create(createUserDto);
    return {
      success: true,
      message: 'Utilisateur créé avec succès',
      user,
    };
  }

  // Connexion
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginUserDto: LoginUserDto) {
    const user = await this.userService.login(loginUserDto);
    return {
      success: true,
      message: 'Connexion réussie',
      user,
    };
  }

  @Roles(UserRole.ADMIN)
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    const users = await this.userService.findAll();
    return {
      success: true,
      count: users.length,
      users,
    };
  }


  // Utilisateurs par rôle
  @Get('role/:role')
  @HttpCode(HttpStatus.OK)
  async findByRole(@Param('role') role: UserRole) {
    const users = await this.userService.findByRole(role);
    return {
      success: true,
      count: users.length,
      users,
    };
  }

  // Utilisateurs actifs
  @Roles(UserRole.ADMIN)
  @Get('active')
  @HttpCode(HttpStatus.OK)
  async findActiveUsers() {
    const users = await this.userService.findActiveUsers();
    return {
      success: true,
      count: users.length,
      users,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() currentUser: any,
  ) {
    // Allow ADMIN and DEVELOPER to view any user, or any user to view their own profile
    if (currentUser.role !== UserRole.ADMIN && 
        currentUser.role !== UserRole.DEVELOPER && 
        currentUser.id !== id) {
      throw new HttpException(
        'Forbidden',
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.userService.findById(id);
    return {
      success: true,
      user,
    };
  }

  
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', new ParseUUIDPipe()) id: string, 
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: any,
  ) {
    // Vérifier que l'utilisateur modifie son propre profil OU est ADMIN
    if (currentUser.id !== id && currentUser.role !== UserRole.ADMIN) {
      throw new HttpException(
        'Vous ne pouvez modifier que votre propre profil',
        HttpStatus.FORBIDDEN,
      );
    }

    // Empêcher un utilisateur non-ADMIN de changer son propre rôle
    if (currentUser.role !== UserRole.ADMIN && updateUserDto.role) {
      throw new HttpException(
        'Vous ne pouvez pas modifier votre propre rôle',
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.userService.update(id, updateUserDto);
    return {
      success: true,
      message: 'Utilisateur mis à jour avec succès',
      user,
    };
  }

  
  @Post(':id/logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() currentUser: any,
  ) {
    // Vérifier que l'utilisateur se déconnecte lui-même OU est ADMIN
    if (currentUser.id !== id && currentUser.role !== UserRole.ADMIN) {
      throw new HttpException(
        'Vous ne pouvez déconnecter que vous-même',
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.userService.logout(id);
    return {
      success: true,
      message: 'Déconnexion réussie',
      user,
    };
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.userService.delete(id);
    return {
      success: true,
      message: 'Utilisateur supprimé avec succès',
    };
  }

  // Assigner à une organisation
  @Roles(UserRole.ADMIN)
  @Post(':id/assign-organization')
  @HttpCode(HttpStatus.OK)
  async assignToOrganization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('organizationName') organizationName: string,
  ) {
    const user = await this.userService.assignToOrganization(id, organizationName);
    return {
      success: true,
      message: 'Utilisateur assigné à l\'organisation avec succès',
      user,
    };
  }

  // Désassigner d'une organisation
  @Roles(UserRole.ADMIN)
  @Post(':id/remove-organization')
  @HttpCode(HttpStatus.OK)
  async removeFromOrganization(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.userService.removeFromOrganization(id);
    return {
      success: true,
      message: 'Utilisateur retiré de l\'organisation avec succès',
      user,
    };
  }

}