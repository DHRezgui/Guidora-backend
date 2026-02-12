import { 
  Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

@Controller('user')  
export class UserController {
  constructor(private readonly userService: UserService) {}

  // Inscription
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

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
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
    @Body() updateUserDto: UpdateUserDto
  ) {
    const user = await this.userService.update(id, updateUserDto);
    return {
      success: true,
      message: 'Utilisateur mis à jour avec succès',
      user,
    };
  }

  
  @Post(':id/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Param('id', new ParseUUIDPipe()) id: string) {
    const user = await this.userService.logout(id);
    return {
      success: true,
      message: 'Déconnexion réussie',
      user,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.userService.delete(id);
    return {
      success: true,
      message: 'Utilisateur supprimé avec succès',
    };
  }
}